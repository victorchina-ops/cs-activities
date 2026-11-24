using System;

class Program
{
    static void Main()
    {
        Random r = new Random(42);
        Console.WriteLine(r.Next());
        Console.WriteLine(r.Next(100));
        Console.WriteLine(r.Next(5, 10));
        Console.WriteLine(r.NextDouble());
        Random r2 = new Random(0);
        Console.WriteLine(r2.Next(1, 7) + " " + r2.Next(1, 7) + " " + r2.Next(1, 7) + " " + r2.Next(1000000));
        Random r3 = new Random(12345);
        for (int i = 0; i < 5; i++) Console.Write(r3.Next(1, 101) + " ");
        Console.WriteLine();
        Random r4 = new Random(-7);
        Console.WriteLine(r4.Next(10) + " " + r4.Next(-5, 5) + " " + r4.Next(0));
        Random r5 = new Random(int.MaxValue);
        Console.WriteLine(r5.Next(1, 1000));
    }
}
