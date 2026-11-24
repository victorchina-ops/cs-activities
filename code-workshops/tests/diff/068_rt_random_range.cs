using System;

class Program
{
    static void Main()
    {
        Random r = new Random(1);
        int lo = 10;
        Console.WriteLine("a");
        Console.WriteLine(r.Next(lo, 5));
    }
}
