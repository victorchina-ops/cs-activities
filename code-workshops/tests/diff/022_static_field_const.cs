using System;

class Program
{
    static int counter = 0;
    const double Rate = 0.17;
    static int limit = 3 * 4;

    static void Bump() { counter++; counter = counter + 1; }

    static void Main()
    {
        Bump(); Bump();
        Console.WriteLine(counter);
        Console.WriteLine(Rate * 100);
        Console.WriteLine(limit);
        const int Local = 5;
        Console.WriteLine(Local * 2);
    }
}
