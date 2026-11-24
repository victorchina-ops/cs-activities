using System;

class Program
{
    static void Main()
    {
        int i = 5; double d = 2; char c = 'a'; 
        double r = i + d;
        Console.WriteLine(r);
        d = i;
        Console.WriteLine(d);
        i = c;
        Console.WriteLine(i);
        d = c;
        Console.WriteLine(d);
        Console.WriteLine(i / 2 + d / 2);
        Console.WriteLine(c + c);
        Console.WriteLine(i == 97 && c == 97);
        Console.WriteLine(d == 97);
        Console.WriteLine(5 == 5.0);
    }
}
